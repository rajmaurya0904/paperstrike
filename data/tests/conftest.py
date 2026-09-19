"""Point DATA_DIR at a throwaway folder before config is imported, so tests
never read or write the developer's real .env and paper.db."""
import os
import sys
import tempfile
from pathlib import Path

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="paperstrike-test-")
for k in list(os.environ):
    if k.startswith(("UPSTOX_", "GROWW_")) or k in ("BROKER", "WEB_ORIGIN", "ALLOWED_HOSTS"):
        del os.environ[k]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
