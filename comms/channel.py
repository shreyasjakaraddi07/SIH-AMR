from typing import List
from interfaces import CommsChannel
from models import IntentMessage

class PubSubChannel(CommsChannel):
    def __init__(self):
        self.messages: List[IntentMessage] = []

    def send(self, message: IntentMessage) -> None:
        """Broadcast a message to the channel."""
        self.messages.append(message)

    def receive(self) -> List[IntentMessage]:
        """Receive all broadcast messages currently in the channel."""
        return self.messages
        
    def clear(self) -> None:
        """Clear the channel. Called by the simulator at the end of a tick."""
        self.messages.clear()
