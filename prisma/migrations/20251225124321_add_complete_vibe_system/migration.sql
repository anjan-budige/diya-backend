-- CreateTable
CREATE TABLE "vibe_invitations" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "invitedUserId" INTEGER NOT NULL,
    "invitedBy" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vibe_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vibe_invitations_invitedUserId_status_idx" ON "vibe_invitations"("invitedUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vibe_invitations_sessionId_invitedUserId_status_key" ON "vibe_invitations"("sessionId", "invitedUserId", "status");

-- AddForeignKey
ALTER TABLE "vibe_invitations" ADD CONSTRAINT "vibe_invitations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "vibe_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vibe_invitations" ADD CONSTRAINT "vibe_invitations_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vibe_invitations" ADD CONSTRAINT "vibe_invitations_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
