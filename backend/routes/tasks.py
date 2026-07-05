from fastapi import APIRouter, HTTPException
from backend.services.tasks import TaskManager

router = APIRouter(prefix="/tasks", tags=["tasks"])

@router.get("/")
def list_tasks():
    return TaskManager.get_all_tasks()

@router.post("/{task_id}/pause")
def pause_task(task_id: str):
    success = TaskManager.pause_task(task_id)
    if not success:
        raise HTTPException(status_code=400, detail="Aufgabe konnte nicht pausiert werden.")
    return {"status": "success", "message": "Pausiert"}

@router.post("/{task_id}/resume")
def resume_task(task_id: str):
    success = TaskManager.resume_task(task_id)
    if not success:
        raise HTTPException(status_code=400, detail="Aufgabe konnte nicht fortgesetzt werden.")
    return {"status": "success", "message": "Fortgesetzt"}

@router.delete("/{task_id}")
def cancel_task(task_id: str):
    success = TaskManager.cancel_task(task_id)
    if not success:
        raise HTTPException(status_code=400, detail="Aufgabe konnte nicht abgebrochen werden.")
    return {"status": "success", "message": "Abgebrochen"}
