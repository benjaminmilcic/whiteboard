import { Module } from '@nestjs/common';
import { SafetyService } from '../safety/safety.service.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

@Module({
  controllers: [ChatController],
  providers: [ChatService, SafetyService],
})
export class ChatModule {}
