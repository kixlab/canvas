import pandas as pd
from pathlib import Path

_human_tool_path_df = None


def get_human_tool_path_df() -> pd.DataFrame:
    """
    Loads the human tool path data from the CSV file.
    Caches the dataframe in memory after the first load.
    """
    global _human_tool_path_df
    if _human_tool_path_df is None:
        csv_path = Path(__file__).parent.parent.parent / "benchmarks" / "modification_gt" / "human-tool-path.csv"
        df = pd.read_csv(csv_path)
        # Pre-process tools column into a set of strings
        df["tools"] = df["tools"].apply(lambda x: set(t.strip() for t in x.split(",")))
        _human_tool_path_df = df
    return _human_tool_path_df


def get_human_tools_by_id(case_id: str) -> set:
    """
    Returns the set of human-used tools for a given case ID.
    Returns an empty set if the ID is not found.
    """
    df = get_human_tool_path_df()
    match = df[df["id"] == case_id]
    if not match.empty:
        return match.iloc[0]["tools"]
    return set() 