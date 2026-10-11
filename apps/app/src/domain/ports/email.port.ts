export interface ReportEmail {
  to: string;
  subject: string;
  filename: string;
  pdf: Buffer;
}
export interface EmailPort {
  readonly available: boolean;
  sendReport(message: ReportEmail): Promise<void>;
}
