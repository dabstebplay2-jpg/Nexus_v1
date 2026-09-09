from dataclasses import dataclass

@dataclass
class Message:
    sender:str
    receiver:str
    action:str
    payload:dict
