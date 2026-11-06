-- CreateTable
CREATE TABLE IF NOT EXISTS "token_topup_requests" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL,
    "amount_vnd" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "wallet_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_topup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "token_topup_requests_code_key" ON "token_topup_requests"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "token_topup_requests_user_id_created_at_idx" ON "token_topup_requests"("user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "token_topup_requests_status_created_at_idx" ON "token_topup_requests"("status", "created_at");
