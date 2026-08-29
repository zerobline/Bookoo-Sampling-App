"""Tkinter operator UI.

Deliberately simple, per the brief: one screen, a big live weight, a status
line, progress, last result, the main controls, and a results table. All
BLE/asyncio work happens on a background thread (see async_bridge) and is
handed to Tk via a thread-safe queue polled with ``root.after``.
"""

from __future__ import annotations

import queue
import statistics
import time
import tkinter as tk
from dataclasses import dataclass
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from typing import Optional

from .async_bridge import AsyncLoopThread
from .scale_source import BLEScaleSource, ScaleReading, SimulatedScaleSource
from .state_machine import STATUS_LABELS, Event, State, StateMachineConfig
from .session import SamplingSession

POLL_INTERVAL_MS = 50
DEFAULT_DATA_DIR = Path.home() / "BookooSamplingApp" / "sessions"

# Warn once the scale's own reported battery drops to/below this, and don't
# warn again until it's recovered well past it (e.g. a battery swap).
LOW_BATTERY_WARN_PCT = 15
LOW_BATTERY_RESET_PCT = 25

# Rough color per status, just to make the state visible at a glance.
STATUS_COLORS = {
    State.IDLE: "#666666",
    State.WAITING_FOR_CUP: "#1f6feb",
    State.CUP_DETECTED: "#1f6feb",
    State.TARING: "#8957e5",
    State.READY: "#1a7f37",
    State.DISPENSING: "#bf5000",
    State.STABILIZING: "#9a6700",
    State.RECORDED: "#1a7f37",
    State.WAITING_FOR_REMOVAL: "#1f6feb",
    State.PAUSED: "#666666",
    State.COMPLETE: "#1a7f37",
    State.STOPPED: "#cf222e",
}


@dataclass
class _ConnectOutcome:
    result: Optional[str]
    error: Optional[BaseException]


@dataclass
class _DisconnectOutcome:
    error: Optional[BaseException]


class SamplingApp:
    def __init__(self, root: tk.Tk, data_dir: Path = DEFAULT_DATA_DIR):
        self.root = root
        self.root.title("BOOKOO Scale – Sample Measurement")
        self.root.geometry("760x760")
        self.root.minsize(680, 680)

        self.data_dir = data_dir
        self.async_loop = AsyncLoopThread()
        self.event_queue: "queue.Queue[object]" = queue.Queue()

        self.config = StateMachineConfig()
        self.session = SamplingSession(self.data_dir, self.config, planned_samples=100)
        self.session.on_event = lambda ev: self.event_queue.put(ev)
        self.session.on_weight = lambda reading: self.event_queue.put(reading)

        self.connected = False
        self.session_started = False
        self._low_battery_warned = False
        self._session_start_wall: Optional[float] = None

        self._build_widgets()
        self._refresh_button_states()
        self.root.after(POLL_INTERVAL_MS, self._poll_events)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    # -- widget construction ---------------------------------------------

    def _build_widgets(self) -> None:
        pad = {"padx": 8, "pady": 6}

        conn = ttk.LabelFrame(self.root, text="Scale connection")
        conn.pack(fill="x", **pad)
        self.simulate_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(conn, text="Simulate scale (no hardware)", variable=self.simulate_var).pack(
            side="left", padx=8, pady=6
        )
        self.connect_btn = ttk.Button(conn, text="Connect", command=self._on_connect)
        self.connect_btn.pack(side="left", padx=4)
        self.disconnect_btn = ttk.Button(conn, text="Disconnect", command=self._on_disconnect)
        self.disconnect_btn.pack(side="left", padx=4)
        self.conn_status_var = tk.StringVar(value="Not connected")
        ttk.Label(conn, textvariable=self.conn_status_var).pack(side="left", padx=10)

        setup = ttk.LabelFrame(self.root, text="Session")
        setup.pack(fill="x", **pad)
        ttk.Label(setup, text="Planned samples (max 100):").pack(side="left", padx=8)
        self.samples_var = tk.IntVar(value=100)
        ttk.Spinbox(setup, from_=1, to=100, textvariable=self.samples_var, width=6).pack(side="left")
        self.start_btn = ttk.Button(setup, text="Start Test", command=self._on_start)
        self.start_btn.pack(side="left", padx=8)
        ttk.Button(setup, text="Settings…", command=self._open_settings).pack(side="left", padx=4)

        center = ttk.Frame(self.root)
        center.pack(fill="x", pady=(10, 0))
        self.weight_var = tk.StringVar(value="---.- g")
        ttk.Label(center, textvariable=self.weight_var, font=("Segoe UI", 56, "bold"), anchor="center").pack(
            fill="x"
        )
        telemetry = ttk.Frame(center)
        telemetry.pack()
        self.battery_var = tk.StringVar(value="Battery: --")
        self.battery_label = ttk.Label(telemetry, textvariable=self.battery_var, font=("Segoe UI", 10))
        self.battery_label.pack(side="left", padx=10)
        self.flow_var = tk.StringVar(value="Flow: -- g/s")
        ttk.Label(telemetry, textvariable=self.flow_var, font=("Segoe UI", 10)).pack(side="left", padx=10)
        self.status_var = tk.StringVar(value=STATUS_LABELS[State.IDLE])
        self.status_label = ttk.Label(center, textvariable=self.status_var, font=("Segoe UI", 18), anchor="center")
        self.status_label.pack(fill="x")
        self.progress_var = tk.StringVar(value="Sample 0 / 100")
        ttk.Label(center, textvariable=self.progress_var, font=("Segoe UI", 13), anchor="center").pack(fill="x")
        self.last_result_var = tk.StringVar(value="Last result: –")
        ttk.Label(center, textvariable=self.last_result_var, font=("Segoe UI", 11), anchor="center").pack(fill="x")

        controls = ttk.Frame(self.root)
        controls.pack(fill="x", **pad)
        self.pause_btn = ttk.Button(controls, text="Pause", command=self._on_pause_resume)
        self.pause_btn.pack(side="left", padx=4)
        self.stop_btn = ttk.Button(controls, text="Stop", command=self._on_stop)
        self.stop_btn.pack(side="left", padx=4)
        self.tare_btn = ttk.Button(controls, text="Manual Tare", command=self._on_manual_tare)
        self.tare_btn.pack(side="left", padx=4)
        self.accept_btn = ttk.Button(controls, text="Accept Measurement", command=self._on_accept)
        self.accept_btn.pack(side="left", padx=4)
        self.redo_btn = ttk.Button(controls, text="Redo Sample", command=self._on_redo)
        self.redo_btn.pack(side="left", padx=4)

        table_frame = ttk.LabelFrame(self.root, text="Results")
        table_frame.pack(fill="both", expand=True, **pad)
        columns = ("sample", "weight", "time")
        self.tree = ttk.Treeview(table_frame, columns=columns, show="headings", height=10)
        self.tree.heading("sample", text="Sample")
        self.tree.heading("weight", text="Final Weight (g)")
        self.tree.heading("time", text="Time")
        self.tree.column("sample", width=80, anchor="center")
        self.tree.column("weight", width=140, anchor="center")
        self.tree.column("time", width=180, anchor="center")
        vsb = ttk.Scrollbar(table_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")

        export = ttk.Frame(self.root)
        export.pack(fill="x", **pad)
        ttk.Button(export, text="Export CSV…", command=self._export_csv).pack(side="left", padx=4)
        ttk.Button(export, text="Export JSON…", command=self._export_json).pack(side="left", padx=4)

        log_frame = ttk.LabelFrame(self.root, text="Messages")
        log_frame.pack(fill="both", **pad)
        self.log = tk.Text(log_frame, height=5, state="disabled", wrap="word")
        self.log.pack(fill="both", expand=True)

    # -- connection --------------------------------------------------------

    def _on_connect(self) -> None:
        if self.simulate_var.get():
            scale = SimulatedScaleSource(cycle_count=self.samples_var.get() or 100)
        else:
            scale = BLEScaleSource()
        self.session.bind_scale(scale)
        self.connect_btn.configure(state="disabled")
        self.conn_status_var.set("Connecting…")

        def done(result, exc):
            # Runs on the background asyncio-loop thread: never touch Tk
            # from here directly (e.g. root.after()) -- only queue.Queue is
            # safe across threads. _poll_events (main thread) picks this up.
            self.event_queue.put(_ConnectOutcome(result, exc))

        self.async_loop.run_coro(self.session.connect_scale(), on_done=done)

    def _connect_finished(self, result, exc) -> None:
        if exc is not None:
            self.connect_btn.configure(state="normal")
            self.conn_status_var.set("Not connected")
            messagebox.showerror("Connection failed", str(exc))
            return
        self.connected = True
        self.conn_status_var.set(f"Connected ({result})")
        self._log(f"Connected to scale ({result})")
        self._low_battery_warned = False
        self._refresh_button_states()

    def _on_disconnect(self) -> None:
        def done(result, exc):
            self.event_queue.put(_DisconnectOutcome(exc))

        self.async_loop.run_coro(self.session.disconnect_scale(), on_done=done)

    def _disconnect_finished(self, exc) -> None:
        self.connected = False
        self.session_started = False
        self.conn_status_var.set("Not connected")
        self._log("Disconnected" if exc is None else f"Disconnected (with error: {exc})")
        self._refresh_button_states()

    # -- session controls --------------------------------------------------

    def _on_start(self) -> None:
        if not self.connected:
            messagebox.showwarning("Not connected", "Connect the scale before starting a test.")
            return
        self.session.planned_samples = self.samples_var.get()
        self.session.config = self.config
        self.session.start()
        self.session_started = True
        self._session_start_wall = time.time()
        self.tree.delete(*self.tree.get_children())
        self.last_result_var.set("Last result: –")
        self._log(f"Session {self.session.session_id} started, target {self.session.planned_samples} samples")
        self._refresh_button_states()

    def _on_pause_resume(self) -> None:
        if self.session.machine.state == State.PAUSED:
            self.async_loop.run_coro(self.session.resume())
        else:
            self.async_loop.run_coro(self.session.pause())

    def _on_stop(self) -> None:
        count = self.session.machine.sample_count
        planned = self.session.planned_samples
        if self.session_started and count < planned:
            if not messagebox.askyesno("Stop test?", f"{count} of {planned} samples completed. Stop the test now?"):
                return
        self.async_loop.run_coro(self.session.stop())
        self.session_started = False
        self._refresh_button_states()
        if count > 0:
            self._show_session_summary("Stopped by operator")

    def _on_manual_tare(self) -> None:
        self.async_loop.run_coro(self.session.manual_tare())
        self._log("Manual tare requested")

    def _on_accept(self) -> None:
        self.async_loop.run_coro(self.session.accept_measurement())

    def _on_redo(self) -> None:
        self.async_loop.run_coro(self.session.redo_sample())

    # -- settings ------------------------------------------------------

    def _open_settings(self) -> None:
        dialog = tk.Toplevel(self.root)
        dialog.title("Detection thresholds")
        dialog.transient(self.root)
        fields = [
            ("min_object_weight_g", "Min. weight to detect a cup (g)"),
            ("cup_stable_tolerance_g", "Cup stability tolerance (±g)"),
            ("cup_stable_window_s", "Cup stability window (s)"),
            ("stabilizing_tolerance_g", "Final weight stability tolerance (±g)"),
            ("stabilizing_window_s", "Final weight stability window (s)"),
            ("removal_threshold_g", "Cup-removed threshold (g)"),
        ]
        vars_by_field = {}
        for row, (attr, label) in enumerate(fields):
            ttk.Label(dialog, text=label).grid(row=row, column=0, sticky="w", padx=8, pady=4)
            var = tk.DoubleVar(value=getattr(self.config, attr))
            ttk.Entry(dialog, textvariable=var, width=10).grid(row=row, column=1, padx=8, pady=4)
            vars_by_field[attr] = var

        def apply_and_close() -> None:
            for attr, var in vars_by_field.items():
                try:
                    setattr(self.config, attr, float(var.get()))
                except (tk.TclError, ValueError):
                    pass
            dialog.destroy()

        ttk.Button(dialog, text="Apply", command=apply_and_close).grid(
            row=len(fields), column=0, columnspan=2, pady=8
        )

    # -- event pump ------------------------------------------------------

    def _poll_events(self) -> None:
        try:
            while True:
                item = self.event_queue.get_nowait()
                if isinstance(item, Event):
                    self._handle_event(item)
                elif isinstance(item, ScaleReading):
                    self.weight_var.set(f"{item.weight_g:6.1f} g")
                    self._handle_telemetry(item)
                elif isinstance(item, _ConnectOutcome):
                    self._connect_finished(item.result, item.error)
                elif isinstance(item, _DisconnectOutcome):
                    self._disconnect_finished(item.error)
        except queue.Empty:
            pass
        self.root.after(POLL_INTERVAL_MS, self._poll_events)

    def _handle_event(self, event: Event) -> None:
        if event.kind == "status_changed":
            self.status_var.set(STATUS_LABELS.get(event.state, event.state.value))
            self.status_label.configure(foreground=STATUS_COLORS.get(event.state, "#000000"))
            planned = self.session.planned_samples
            self.progress_var.set(f"Sample {self.session.machine.sample_count} / {planned}")
            if event.state == State.COMPLETE:
                self._log("Session complete")
                self.session_started = False
                self._show_session_summary("Planned sample count reached")
            self._refresh_button_states()
        elif event.kind == "sample_recorded":
            self.tree.insert(
                "", "end", values=(event.sample_number, f"{event.weight_g:.1f}", time.strftime("%H:%M:%S"))
            )
            self.tree.yview_moveto(1.0)
            suffix = " (manual)" if event.accepted_manually else ""
            self.last_result_var.set(f"Last result: Sample {event.sample_number}: {event.weight_g:.1f} g{suffix}")
            self._log(event.message)
        elif event.kind == "sample_discarded":
            children = self.tree.get_children()
            if children:
                self.tree.delete(children[-1])
            self._log(event.message)
        elif event.kind == "warning":
            self._log(f"WARNING: {event.message}")

    def _log(self, message: str) -> None:
        self.log.configure(state="normal")
        self.log.insert("end", f"[{time.strftime('%H:%M:%S')}] {message}\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def _handle_telemetry(self, reading: ScaleReading) -> None:
        """Battery/flow are already decoded by protocol.py for real hardware,
        and by the simulator for parity -- just render + watch them here."""
        battery = reading.decoded.get("battery_pct")
        if battery is not None:
            self.battery_var.set(f"Battery: {battery:.0f}%")
            if battery <= LOW_BATTERY_WARN_PCT:
                if not self._low_battery_warned:
                    self._low_battery_warned = True
                    self._log(f"WARNING: scale battery low ({battery:.0f}%)")
                self.battery_label.configure(foreground="#cf222e")
            else:
                self.battery_label.configure(foreground="")
                if battery >= LOW_BATTERY_RESET_PCT:
                    self._low_battery_warned = False

        flow = reading.decoded.get("flow_g_s")
        if flow is not None:
            self.flow_var.set(f"Flow: {flow:+.1f} g/s")

    def _show_session_summary(self, reason: str) -> None:
        samples = self.session.store.samples if self.session.store is not None else []
        if not samples:
            self._log(f"Session ended ({reason}); no samples recorded.")
            return

        weights = [s.final_weight_g for s in samples]
        elapsed_s = time.time() - self._session_start_wall if self._session_start_wall else 0.0
        minutes, seconds = divmod(int(elapsed_s), 60)

        dialog = tk.Toplevel(self.root)
        dialog.title("Session summary")
        dialog.transient(self.root)

        ttk.Label(dialog, text=reason, font=("Segoe UI", 11, "bold")).grid(
            row=0, column=0, columnspan=2, sticky="w", padx=12, pady=(12, 6)
        )
        stats = [
            ("Samples recorded", str(len(weights))),
            ("Average weight", f"{statistics.fmean(weights):.1f} g"),
            ("Min / Max", f"{min(weights):.1f} g / {max(weights):.1f} g"),
            ("Std. deviation", f"{statistics.pstdev(weights):.2f} g" if len(weights) >= 2 else "n/a"),
            ("Duration", f"{minutes}m {seconds:02d}s"),
        ]
        for row, (label, value) in enumerate(stats, start=1):
            ttk.Label(dialog, text=f"{label}:").grid(row=row, column=0, sticky="w", padx=12, pady=2)
            ttk.Label(dialog, text=value).grid(row=row, column=1, sticky="w", padx=12, pady=2)

        buttons = ttk.Frame(dialog)
        buttons.grid(row=len(stats) + 1, column=0, columnspan=2, pady=10)
        ttk.Button(buttons, text="Export CSV…", command=lambda: (self._export_csv(), dialog.destroy())).pack(
            side="left", padx=6
        )
        ttk.Button(buttons, text="Close", command=dialog.destroy).pack(side="left", padx=6)

    # -- export ----------------------------------------------------------

    def _export_csv(self) -> None:
        if self.session.store is None:
            messagebox.showinfo("No session", "Start a test before exporting.")
            return
        path = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV", "*.csv")])
        if path:
            self.session.store.export_csv(Path(path))
            self._log(f"Exported results to {path}")

    def _export_json(self) -> None:
        if self.session.store is None:
            messagebox.showinfo("No session", "Start a test before exporting.")
            return
        path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON", "*.json")])
        if path:
            self.session.store.export_json(Path(path))
            self._log(f"Exported results to {path}")

    # -- misc -----------------------------------------------------------

    def _refresh_button_states(self) -> None:
        self.connect_btn.configure(state="disabled" if self.connected else "normal")
        self.disconnect_btn.configure(state="normal" if self.connected else "disabled")
        self.start_btn.configure(state="normal" if self.connected and not self.session_started else "disabled")

        running = self.session_started and self.session.machine.state not in (
            State.IDLE,
            State.COMPLETE,
            State.STOPPED,
        )
        self.pause_btn.configure(
            state="normal" if running else "disabled",
            text="Resume" if self.session.machine.state == State.PAUSED else "Pause",
        )
        self.stop_btn.configure(state="normal" if running else "disabled")
        self.tare_btn.configure(state="normal" if self.connected else "disabled")
        self.accept_btn.configure(state="normal" if running else "disabled")
        self.redo_btn.configure(state="normal" if self.session_started else "disabled")

    def _on_close(self) -> None:
        if self.connected:
            try:
                # Block briefly for a clean disconnect -- acceptable on
                # shutdown, unlike during normal operation.
                self.async_loop.run_coro(self.session.disconnect_scale()).result(timeout=3.0)
            except Exception:
                pass
        self.session.close()
        self.async_loop.stop()
        self.root.destroy()
