from abc import ABC, abstractmethod
from typing import List
from src.database import JobSchema, JobRunSchema

class BaseCollector(ABC):
    @abstractmethod
    def discover_jobs(self) -> List[JobSchema]:
        """Discovers and returns all active jobs/pipelines from the target source."""
        pass

    @abstractmethod
    def collect(self) -> List[JobRunSchema]:
        """Polls run execution histories and returns the metadata logs."""
        pass
