import { Test, TestingModule } from '@nestjs/testing'
import { TasksService } from './tasks.service'
import { BullModule } from '@nestjs/bullmq'
import { ConfigModule } from '@nestjs/config'
import {
  TaskServiceData,
  TaskServiceDataSchema
} from './schemas/task-service-data'
import { MongooseModule } from '@nestjs/mongoose'

describe('TasksService', () => {
  let service: TasksService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRoot(
          'mongodb://localhost/operator-registry-controller-tasks-service-tests'
        ),
        BullModule.registerQueue({
          name: 'tasks-queue',
          connection: { host: 'localhost', port: 6379 }
        }),
        BullModule.registerQueue({
          name: 'validation-queue',
          connection: { host: 'localhost', port: 6379 }
        }),
        BullModule.registerQueue({
          name: 'verification-queue',
          connection: { host: 'localhost', port: 6379 }
        }),
        BullModule.registerFlowProducer({
          name: 'validation-flow',
          connection: { host: 'localhost', port: 6379 }
        }),
        BullModule.registerFlowProducer({
          name: 'verification-flow',
          connection: { host: 'localhost', port: 6379 }
        }),
        MongooseModule.forFeature([
          {
            name: TaskServiceData.name,
            schema: TaskServiceDataSchema
          }
        ])
      ],
      providers: [TasksService]
    }).compile()

    service = module.get<TasksService>(TasksService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
