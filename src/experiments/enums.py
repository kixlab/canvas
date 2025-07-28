from enum import Enum, auto

class ExperimentVariant(str, Enum):
    # Generation variants
    IMAGE_ONLY = "image_only"
    TEXT_LEVEL_1 = "text_level_1"
    TEXT_LEVEL_2 = "text_level_2"
    IMAGE_TEXT_LEVEL_1 = "image_text_level_1"
    IMAGE_TEXT_LEVEL_2 = "image_text_level_2"
    
    # Modification variants
    WITHOUT_ORACLE = "without_oracle"
    PERFECT_HIERARCHY = "perfect_hierarchy"
    PERFECT_CANVAS = "perfect_canvas"

class ModelType(str, Enum):
    GPT4o = "gpt-4o"
    GPT41 = "gpt-4.1"
    GPT4oMINI = "gpt-4o-mini"
    O3 = "o3"
    CLAUDE35 = "claude-3-5-sonnet"
    GEMINI25FLASH = "gemini-2.5-flash"
    GEMINI25PRO = "gemini-2.5-pro"
    LLAMA4MAVERICK = "llama-4-maverick"
    LLAMA4SCOUT = "llama-4-scout"

class Channel(str, Enum):
    CHANNEL_1 = "channel_1"
    CHANNEL_2 = "channel_2"
    CHANNEL_3 = "channel_3"
    CHANNEL_4 = "channel_4"
    CHANNEL_5 = "channel_5"
    CHANNEL_6 = "channel_6"
    CHANNEL_7 = "channel_7"

class TaskType(str, Enum):
    MODIFICATION = "modification"
    GENERATION = "generation"
    SAMPLE = "sample"

class AgentType(str, Enum):
    REACT_REPLICATION = "react_replication"
    CODE_REPLICATION = "code_replication"
    SINGLE_REPLICATION = "single_replication"
    REACT_MODIFICATION = "react_modification"
    SINGLE_MODIFICATION = "single_modification"

class GuidanceType(str, Enum):
    NONE = "none"
    BASIC = "basic"
    ADVANCED = "advanced"
    ORACLE = "oracle" 