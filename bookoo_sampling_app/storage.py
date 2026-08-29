"""Persistence for a measurement session.

Two things are written as the session runs, so nothing is lost if the app
or the machine crashes mid-session:

* ``results_<session_id>.csv`` -- the MVP sample table (sample number,
  final weight, timestamp, session id), appended to as each sample is
  recorded.
* ``raw_<session_id>.jsonl`` -- every timestamped scale reading with the
  state it was taken in. Not shown in the UI, but kept so flow-rate/curve
  analysis can be added later without redesigning the measurement pipeline
  (see "Out of Scope for First Version" in the brief).

``export_csv``/``export_json`` additionally let the operator save a copy of
just the results table wherever they choose at the end of a session.
"""

from __future__ import annotations

import csv
import json
from dataclasses import asdict
from pathlib import Path
from typing import List, Optional

from .models import RawReading, SampleRecord

RESULT_FIELDS = ["session_id", "sample_number", "final_weight_g", "timestamp", "accepted_manually"]


class SessionStore:
    def __init__(self, session_id: str, data_dir: Path):
        self.session_id = session_id
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

        self.results_path = self.data_dir / f"results_{session_id}.csv"
        self.raw_path = self.data_dir / f"raw_{session_id}.jsonl"
        self.samples: List[SampleRecord] = []

        self._results_file = self.results_path.open("w", newline="", encoding="utf-8")
        self._results_writer = csv.DictWriter(self._results_file, fieldnames=RESULT_FIELDS)
        self._results_writer.writeheader()
        self._results_file.flush()

        self._raw_file = self.raw_path.open("w", encoding="utf-8")

    def add_reading(self, reading: RawReading) -> None:
        self._raw_file.write(json.dumps(asdict(reading)) + "\n")
        self._raw_file.flush()

    def add_sample(self, sample: SampleRecord) -> None:
        self.samples.append(sample)
        self._results_writer.writerow(asdict(sample))
        self._results_file.flush()

    def discard_last_sample(self) -> Optional[SampleRecord]:
        """Remove the last recorded sample (used by "Redo Sample").

        The results CSV is append-only during the session (so a crash never
        loses data); it is rewritten from ``self.samples`` here since a redo
        should be rare and this keeps the on-disk file consistent with what
        the UI shows.
        """
        if not self.samples:
            return None
        removed = self.samples.pop()
        self._rewrite_results_file()
        return removed

    def _rewrite_results_file(self) -> None:
        self._results_file.close()
        self._results_file = self.results_path.open("w", newline="", encoding="utf-8")
        self._results_writer = csv.DictWriter(self._results_file, fieldnames=RESULT_FIELDS)
        self._results_writer.writeheader()
        for sample in self.samples:
            self._results_writer.writerow(asdict(sample))
        self._results_file.flush()

    def export_csv(self, path: Path) -> None:
        path = Path(path)
        with path.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=RESULT_FIELDS)
            writer.writeheader()
            for sample in self.samples:
                writer.writerow(asdict(sample))

    def export_json(self, path: Path) -> None:
        path = Path(path)
        path.write_text(
            json.dumps([asdict(sample) for sample in self.samples], indent=2),
            encoding="utf-8",
        )

    def close(self) -> None:
        if not self._results_file.closed:
            self._results_file.close()
        if not self._raw_file.closed:
            self._raw_file.close()
