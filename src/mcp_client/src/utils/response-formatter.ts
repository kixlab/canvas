import { Response } from "express";
import { ResponseData, ResponseStatus } from "../types";

export class ResponseFormatter {
  static success(
    res: Response<ResponseData>,
    message?: string,
    payload?: any
  ): void {
    res.json({
      status: ResponseStatus.SUCCESS,
      ...(message && { message }),
      ...(payload && { payload }),
    });
  }

  static error(
    res: Response<ResponseData>,
    message: string,
    statusCode = 500
  ): void {
    res.status(statusCode).json({
      status: ResponseStatus.ERROR,
      message,
    });
  }

  static badRequest(res: Response<ResponseData>, message: string): void {
    this.error(res, message, 400);
  }

  static notFound(res: Response<ResponseData>, message: string): void {
    this.error(res, message, 404);
  }

  static handleError(
    res: Response<ResponseData>,
    error: any,
    context: string
  ): void {
    console.error(`Error in ${context}:`, error);
    this.error(res, String(error));
  }
}

export function withErrorHandling<T extends any[]>(
  handler: (...args: T) => Promise<void>
) {
  return async (...args: T): Promise<void> => {
    try {
      await handler(...args);
    } catch (error) {
      const res = args[1] as Response<ResponseData>; // Response is always second parameter
      const handlerName = handler.name || "unknown";
      ResponseFormatter.handleError(res, error, handlerName);
    }
  };
}
