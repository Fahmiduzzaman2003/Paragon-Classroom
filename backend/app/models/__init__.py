from .user import User
from .course import Course
from .enrollment import Enrollment
from .material import Material
from .conversation import Conversation, Message
from .quiz import Attempt, AttemptAttachment, Question, Quiz
from .assignment import Assignment, Submission
from .forum import ForumReply, ForumThread
from .event import Announcement, CalendarEvent
from .notification import Notification
from .flashcard import Flashcard

__all__ = [
    "User",
    "Course",
    "Enrollment",
    "Material",
    "Conversation",
    "Message",
    "Attempt",
    "AttemptAttachment",
    "Question",
    "Quiz",
    "Assignment",
    "Submission",
    "ForumReply",
    "ForumThread",
    "Announcement",
    "CalendarEvent",
    "Notification",
    "Flashcard",
]
