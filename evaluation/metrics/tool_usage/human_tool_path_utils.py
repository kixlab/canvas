import pandas as pd
from pathlib import Path
from typing import List, Optional

_human_tool_path_df = None


def get_human_tool_path_df() -> pd.DataFrame:
    """
    Loads the human tool path data from the CSV file.
    Caches the dataframe in memory after the first load.
    """
    global _human_tool_path_df
    if _human_tool_path_df is None:
        csv_path = (
            Path(__file__).parent.parent.parent.parent
            / "dataset"
            / "benchmarks"
            / "modification_gt"
            / "human-tool-path.csv"
        )
        df = pd.read_csv(csv_path)
        df["tools"] = df["tools"].apply(lambda x: set(t.strip() for t in x.split(",")))
        _human_tool_path_df = df
    return _human_tool_path_df


def get_human_tools_by_id(case_id: str) -> Optional[List[str]]:
    """
    Returns a list of human-annotated ideal tools for a given case ID.

    Args:
        case_id: The case identifier (e.g., "gid6-27-gpt-4o-image_only")

    Returns:
        List of human tools for the given case, or None if not found
    """
    df = get_human_tool_path_df()

    base_id = None

    if "_" in case_id:
        parts = case_id.split("_")
        if len(parts) >= 2:
            base_id = "_".join(parts[:-1])
    else:
        parts = case_id.split("-")
        if len(parts) >= 2:
            base_id = "-".join(parts[:2])

    if not base_id:
        return None

    exact_match = df[df["id"] == base_id]
    if not exact_match.empty:
        tools = exact_match.iloc[0]["tools"]
        return list(tools) if isinstance(tools, set) else tools

    partial_matches = df[df["id"].str.contains(base_id, na=False)]
    if not partial_matches.empty:
        tools = partial_matches.iloc[0]["tools"]
        return list(tools) if isinstance(tools, set) else tools

    if "gid" in case_id:
        import re

        gid_match = re.search(r"gid\d+(-\d+)?", case_id)
        if gid_match:
            gid_part = gid_match.group()
            gid_matches = df[df["id"].str.contains(gid_part, na=False)]
            if not gid_matches.empty:
                tools = gid_matches.iloc[0]["tools"]
                return list(tools) if isinstance(tools, set) else tools

    return None
