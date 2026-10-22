.PHONY: check data serve smoke

# Acceptance gate: JS vs Python twins (1e-9), null cases, LBNL headline, copy-number trace,
# then our estimators vs statsmodels (an independent implementation).
check:
	node tests/check.mjs
	uv run -q --with statsmodels python3 tests/check_statsmodels.py

# Re-download LBNL Queued Up (SHA-256 checked) and rebuild data/queue.json + data/SNAPSHOT.md.
data:
	uv run -q --with pandas --with openpyxl python3 data/fetch_clean.py

# Serve locally with caching off (ES modules need http://, not file://).
serve:
	python3 tools/serve.py

# Load every route in headless Chrome and fail on any error (needs `make serve` running).
smoke:
	bash tools/smoke.sh
