import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { ValidationQueue } from './processors/validation-queue'
import { TasksQueue } from './processors/tasks-queue'
import { TasksService } from './tasks.service'
import { ValidationModule } from 'src/validation/validation.module'
import { VerificationQueue } from './processors/verification-queue'
import { VerificationModule } from '../verification/verification.module'

import {
  TaskServiceData,
  TaskServiceDataSchema
} from './schemas/task-service-data'

@Module({
  imports: [
    ValidationModule,
    VerificationModule,
    BullModule.registerQueue({
      name: 'tasks-queue',
      streams: { events: { maxLen: 1000 } }
    }),
    BullModule.registerQueue({
      name: 'validation-queue',
      streams: { events: { maxLen: 1000 } }
    }),
    BullModule.registerFlowProducer({ name: 'validation-flow' }),
    BullModule.registerQueue({
      name: 'verification-queue',
      streams: { events: { maxLen: 1000 } }
    }),
    BullModule.registerFlowProducer({ name: 'verification-flow' }),
    MongooseModule.forFeature([
      {
        name: TaskServiceData.name,
        schema: TaskServiceDataSchema
      }
    ])
  ],
  providers: [TasksService, TasksQueue, ValidationQueue, VerificationQueue],
  exports: [TasksService]
})
export class TasksModule {}
