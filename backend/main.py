from __future__ import annotations

import argparse

from .config import load_config
from .pipeline import VisitorPipeline


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Intelligent face tracker with auto-registration and counting")
    parser.add_argument("--config", default="backend/config.json", help="Path to config.json")
    parser.add_argument("--source", default="", help="Override input source")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_config(args.config)
    pipeline = VisitorPipeline(config)
    count = pipeline.run(args.source or None)
    print(f"Unique visitors: {count}")


if __name__ == "__main__":
    main()