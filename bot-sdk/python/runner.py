import importlib.util
import sys

from ott_strategy_sdk import run_strategy

def main() -> int:
    if len(sys.argv) != 2:
        print("strategy source path is required", file=sys.stderr)
        return 1
    spec = importlib.util.spec_from_file_location("ott_competitor_strategy", sys.argv[1])
    if spec is None or spec.loader is None:
        print("unable to load strategy source", file=sys.stderr)
        return 1
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    choose_move = getattr(module, "choose_move", None)
    if not callable(choose_move):
        print("missing choose_move", file=sys.stderr)
        return 1
    return run_strategy(choose_move)

if __name__ == "__main__":
    raise SystemExit(main())
