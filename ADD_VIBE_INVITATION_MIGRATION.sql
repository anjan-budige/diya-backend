-- Add this to your schema.prisma file:

-- First, add to User model (inside model User { }):
vibeInvitationsSent     VibeInvitation[] @relation("Inviter")
vibeInvitationsReceived VibeInvitation[] @relation("InvitedUser")

-- Then add this new model at the end of schema.prisma:

model VibeInvitation {
  id            Int      @id @default(autoincrement())
  sessionId     Int
  invitedUserId Int
  invitedBy     Int
  status        String   @default("pending") // pending, accepted, declined, expired
  createdAt     DateTime @default(now())
  
  session       VibeSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  invitedUser   User        @relation("InvitedUser", fields: [invitedUserId], references: [id], onDelete: Cascade)
  inviter       User        @relation("Inviter", fields: [invitedBy], references: [id], onDelete: Cascade)
  
  @@unique([sessionId, invitedUserId, status])
  @@index([invitedUserId, status])
}

-- Also add to VibeSession model (if it exists, add this line inside it):
invitations VibeInvitation[]

-- After adding to schema.prisma, run these commands:
-- cd diya-backend
-- npx prisma migrate dev --name add_vibe_invitations
-- npx prisma generate

-- If VibeSession model doesn't exist yet, you need to create it first!
-- Check if your database actually has the vibe_sessions table
