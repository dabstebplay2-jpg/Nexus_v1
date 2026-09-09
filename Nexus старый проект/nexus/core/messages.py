from dataclasses import dataclass

@dataclass
class AgentMessage:
    sender:str
    receiver:str
    type:str
    content:dict
