"""Runs an asyncio event loop on a background thread for the Tk GUI.

bleak (and the simulator) are asyncio-based; Tkinter needs its own mainloop
on the main thread. This small helper lets GUI callbacks schedule coroutines
onto the background loop and get the result back without blocking the UI.
"""

from __future__ import annotations

import asyncio
import threading
from concurrent.futures import Future
from typing import Any, Callable, Coroutine, Optional


class AsyncLoopThread:
    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run, name="ble-loop", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def run_coro(
        self,
        coro: Coroutine[Any, Any, Any],
        on_done: Optional[Callable[[Any, Optional[BaseException]], None]] = None,
    ) -> Future:
        """Schedule ``coro`` on the loop thread.

        ``on_done(result, exception)`` is called on the *loop* thread when it
        finishes, if given -- callers running Tk should marshal that back to
        the main thread themselves (e.g. via ``root.after``).
        """
        future = asyncio.run_coroutine_threadsafe(coro, self.loop)
        if on_done is not None:

            def _done(fut: Future) -> None:
                try:
                    result = fut.result()
                except Exception as exc:  # noqa: BLE001 - surface any error to the caller
                    on_done(None, exc)
                else:
                    on_done(result, None)

            future.add_done_callback(_done)
        return future

    def stop(self) -> None:
        self.loop.call_soon_threadsafe(self.loop.stop)
        self._thread.join(timeout=2.0)
