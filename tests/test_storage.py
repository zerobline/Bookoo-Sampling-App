import csv
import json

from bookoo_sampling_app.models import RawReading, SampleRecord
from bookoo_sampling_app.storage import SessionStore


def test_store_writes_results_csv_incrementally(tmp_path):
    store = SessionStore("session_test", tmp_path)
    store.add_sample(SampleRecord(session_id="session_test", sample_number=1, final_weight_g=121.8))
    store.add_sample(SampleRecord(session_id="session_test", sample_number=2, final_weight_g=123.1))
    store.close()

    with store.results_path.open() as fh:
        rows = list(csv.DictReader(fh))
    assert len(rows) == 2
    assert rows[0]["sample_number"] == "1"
    assert rows[0]["final_weight_g"] == "121.8"
    assert rows[1]["final_weight_g"] == "123.1"


def test_store_logs_raw_readings_as_jsonl(tmp_path):
    store = SessionStore("session_test", tmp_path)
    store.add_reading(
        RawReading(session_id="session_test", monotonic_s=1.23, timestamp="t", weight_g=5.0, state="ready")
    )
    store.close()

    lines = store.raw_path.read_text().strip().splitlines()
    assert len(lines) == 1
    row = json.loads(lines[0])
    assert row["weight_g"] == 5.0
    assert row["state"] == "ready"


def test_discard_last_sample_removes_it_from_memory_and_disk(tmp_path):
    store = SessionStore("session_test", tmp_path)
    store.add_sample(SampleRecord(session_id="session_test", sample_number=1, final_weight_g=100.0))
    store.add_sample(SampleRecord(session_id="session_test", sample_number=2, final_weight_g=200.0))

    removed = store.discard_last_sample()
    assert removed.sample_number == 2
    assert len(store.samples) == 1

    with store.results_path.open() as fh:
        rows = list(csv.DictReader(fh))
    assert len(rows) == 1
    assert rows[0]["sample_number"] == "1"
    store.close()


def test_export_csv_and_json(tmp_path):
    store = SessionStore("session_test", tmp_path)
    store.add_sample(SampleRecord(session_id="session_test", sample_number=1, final_weight_g=121.8))
    store.close()

    csv_path = tmp_path / "out.csv"
    json_path = tmp_path / "out.json"
    store.export_csv(csv_path)
    store.export_json(json_path)

    with csv_path.open() as fh:
        rows = list(csv.DictReader(fh))
    assert rows[0]["final_weight_g"] == "121.8"

    data = json.loads(json_path.read_text())
    assert data[0]["final_weight_g"] == 121.8
