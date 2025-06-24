import argparse
from pathlib import Path
from typing import Dict

from evaluation.structure.tree_edit import _load_root

def _print_tree(node: Dict, depth: int = 0, by_type_only: bool = False):
    name = node.get("name", "unknown")
    ntype = node.get("type", "unknown")
    label = ntype if by_type_only else f"{name} ({ntype})"
    print("  " * depth + "- " + label)
    for child in node.get("children", []):
        _print_tree(child, depth + 1, by_type_only)


def main():
    parser = argparse.ArgumentParser(description="Print Figma node tree")
    parser.add_argument("json", type=str, help="Path to Figma JSON file")
    parser.add_argument("--type_only", action="store_true", help="Show only node types")
    args = parser.parse_args()

    root = _load_root(args.json)
    _print_tree(root, by_type_only=args.type_only)


if __name__ == "__main__":
    main() 