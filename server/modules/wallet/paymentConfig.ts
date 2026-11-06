export const TOKEN_RATE_VND = 10_000;

export const TOPUP_MIN_TOKENS = 10;
export const TOPUP_MAX_TOKENS = 10_000;
export const TOPUP_MAX_PENDING_PER_USER = 5;

export interface PaymentBankInfo {
  bankBin: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export const PAYMENT_BANK: PaymentBankInfo = {
  bankBin: process.env.PAYMENT_BANK_BIN || '970407',
  bankName: 'Techcombank',
  accountNumber: process.env.PAYMENT_BANK_ACCOUNT || '2628121220',
  accountName: process.env.PAYMENT_BANK_ACCOUNT_NAME || 'NGUYEN PHAN HOANG LINH',
};

export function tokensToVnd(tokens: number): number {
  return tokens * TOKEN_RATE_VND;
}

export function buildVietQrUrl(opts: { amountVnd: number; content: string }): string {
  const { bankBin, accountNumber, accountName } = PAYMENT_BANK;
  const params = new URLSearchParams({
    amount: String(opts.amountVnd),
    addInfo: opts.content,
    accountName,
  });
  return `https://img.vietqr.io/image/${bankBin}-${accountNumber}-compact2.png?${params.toString()}`;
}
