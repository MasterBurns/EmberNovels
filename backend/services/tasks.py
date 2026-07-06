import uuid
import time
import threading
from typing import Dict, Any, Callable

class TaskState:
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused" # User needs to confirm
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class BackgroundTask:
    def __init__(self, id: str, name: str, total_steps: int, func: Callable, args: tuple = ()):
        self.id = id
        self.name = name
        self.total_steps = total_steps
        self.current_step = 0
        self.status = TaskState.PENDING
        self.message = "Initialisiere..."
        self.error = None
        self._func = func
        self._args = args
        self._pause_event = threading.Event()
        self._pause_event.set() # True means allowed to run
        self._cancel_flag = False
        self._thread = None
        
        # Rate limit / batch settings
        self.batch_limit = 10
        self.steps_since_pause = 0
        self.delay_between_steps = 2.0

    def start(self):
        self.status = TaskState.RUNNING
        self._thread = threading.Thread(target=self._run_wrapper, daemon=True)
        self._thread.start()

    def _run_wrapper(self):
        try:
            with open("tasks_debug.log", "a", encoding="utf-8") as f: f.write(f"Task {self.name} started.\n")
            self._func(self, *self._args)
            if not self._cancel_flag:
                self.status = TaskState.COMPLETED
                self.message = "Abgeschlossen"
            with open("tasks_debug.log", "a", encoding="utf-8") as f: f.write(f"Task {self.name} ended with status {self.status}.\n")
        except Exception as e:
            self.status = TaskState.FAILED
            self.error = str(e)
            self.message = f"Fehler: {str(e)}"
            with open("tasks_debug.log", "a", encoding="utf-8") as f:
                import traceback
                f.write(f"Task {self.name} CRASHED: {e}\n{traceback.format_exc()}\n")

    def wait_if_paused(self):
        # Pause logic based on batch limit
        if self.batch_limit > 0 and self.steps_since_pause >= self.batch_limit:
            self.pause("Batch-Limit erreicht. Bitte manuell fortsetzen.")
            
        if not self._pause_event.is_set():
            self.status = TaskState.PAUSED
            self._pause_event.wait() # Block until resumed
            if not self._cancel_flag:
                self.status = TaskState.RUNNING
                self.message = "Fortgesetzt..."
                self.steps_since_pause = 0

    def pause(self, msg="Pausiert"):
        self.message = msg
        self._pause_event.clear()

    def resume(self):
        self._pause_event.set()

    def cancel(self):
        self._cancel_flag = True
        self.status = TaskState.CANCELLED
        self.message = "Abgebrochen"
        self._pause_event.set() # Unblock if paused

    def is_cancelled(self) -> bool:
        return self._cancel_flag

    def update_progress(self, step: int, msg: str):
        self.current_step = step
        self.message = msg
        self.steps_since_pause += 1
        
    def sleep_delay(self):
        if self.delay_between_steps > 0:
            time.sleep(self.delay_between_steps)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "total_steps": self.total_steps,
            "current_step": self.current_step,
            "status": self.status,
            "message": self.message,
            "error": self.error,
            "progress_percent": int((self.current_step / self.total_steps) * 100) if self.total_steps > 0 else 0
        }

class TaskManager:
    _tasks: Dict[str, BackgroundTask] = {}

    @classmethod
    def create_task(cls, name: str, total_steps: int, func: Callable, args: tuple = ()) -> BackgroundTask:
        task_id = str(uuid.uuid4())
        task = BackgroundTask(task_id, name, total_steps, func, args)
        cls._tasks[task_id] = task
        return task

    @classmethod
    def get_all_tasks(cls):
        # Optional: clean up old completed/failed tasks
        return [t.to_dict() for t in cls._tasks.values()]

    @classmethod
    def get_task(cls, task_id: str) -> BackgroundTask:
        return cls._tasks.get(task_id)

    @classmethod
    def pause_task(cls, task_id: str):
        task = cls.get_task(task_id)
        if task and task.status == TaskState.RUNNING:
            task.pause("Manuell pausiert")
            return True
        return False

    @classmethod
    def resume_task(cls, task_id: str):
        task = cls.get_task(task_id)
        if task and task.status == TaskState.PAUSED:
            task.resume()
            return True
        return False

    @classmethod
    def cancel_task(cls, task_id: str):
        task = cls.get_task(task_id)
        if task:
            task.cancel()
            return True
        return False
