# OpsLens: Jupyter training notebook + offline JSON prediction

This version replaces the command-line training script with a documented Jupyter notebook and replaces the HTTP prediction API with a local JSON-file inference runner. No backend is required yet.

## Package contents

- `OpsLens_Training.ipynb` — documented, end-to-end dataset discovery, preprocessing, training, evaluation, and artifact export.
- `predict.py` — reads a JSON request and writes/prints predictions.
- `features.py` — shared feature engineering used by notebook and predictor.
- `sample_request.json` — example request; replace the placeholder `model_id`.
- `requirements.txt` — dependencies.

## Setup

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

Put the full extracted dataset under `data/` (all subfolders retained), then launch:

```bash
jupyter lab
```

Open `OpsLens_Training.ipynb`, update `DATA_DIR` if needed, and run all cells from top to bottom. Outputs are saved to `artifacts/`.

## Predict from a sample JSON

1. Open `artifacts/manifest.json`.
2. Copy an exact `model_id` from its `models` list.
3. Replace `REPLACE_WITH_MODEL_ID_FROM_MANIFEST` in `sample_request.json`.
4. Run:

```bash
python predict.py --input sample_request.json --artifacts-dir ./artifacts
```

Save output to a file:

```bash
python predict.py --input sample_request.json --output prediction_result.json --artifacts-dir ./artifacts
```

The request supports `model_id` (recommended), or `source_file`/`series`/`model_name` if the selector matches exactly one trained model. `history` is optional; if omitted, the saved training context is used. `observations` contains the new points to classify.

Scores are not probabilities. Higher `anomaly_score` means more anomalous.

## Notebook methodology

- Each compatible CSV is treated as a separate metric time series and gets its own Isolation Forest.
- CSV discovery is recursive, so the notebook can process the whole dataset tree.
- Timestamp/value columns are detected automatically; labels are optional.
- Labels are used only for evaluation, never as training features.
- The split is chronological to avoid training on future rows and evaluating on past rows.
- The scaler and model are saved together with normalization parameters, feature configuration, evaluation, and a historical context tail.
- Inference imports the same `features.py` module to keep transformations consistent.

Only load trusted joblib artifacts; joblib files use Python pickle serialization.
