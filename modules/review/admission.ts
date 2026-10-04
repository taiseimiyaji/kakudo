import { DomainError } from "../../lib/errors";
import { reviewAdmissionStatus, type ReviewAdmissionCode } from "../../shared/review";

export class ReviewAdmissionError extends DomainError {
  constructor(public code: ReviewAdmissionCode, message: string) {
    super(message, reviewAdmissionStatus[code]);
  }
}
