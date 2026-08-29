"""Entry point: ``python -m bookoo_sampling_app.main``."""

from __future__ import annotations

import argparse
import tkinter as tk
from pathlib import Path

from .gui import DEFAULT_DATA_DIR, SamplingApp


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="BOOKOO Scale sample measurement app")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help="Where session result/raw-reading files are written (default: %(default)s)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = tk.Tk()
    SamplingApp(root, data_dir=args.data_dir)
    root.mainloop()


if __name__ == "__main__":
    main()
