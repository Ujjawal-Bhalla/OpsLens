import json

with open("artifacts/manifest.json", "r") as f:
    manifest = json.load(f)

print("Total trained models:", manifest.get("trained_models"))

for model in manifest.get("models", []):
    print("\nModel ID:", model["model_id"])
    print("Source:", model["source_file"])
    print("Artifact:", model["artifact"])