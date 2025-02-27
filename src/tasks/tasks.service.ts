import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectQueue, InjectFlowProducer } from '@nestjs/bullmq'
import { Queue, FlowProducer, FlowJob } from 'bullmq'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'

import { ValidationData } from '../validation/schemas/validation-data'
import { TaskServiceData } from './schemas/task-service-data'

@Injectable()
export class TasksService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TasksService.name)

  private isLive?: string
  private doClean?: string
  private dataId: Types.ObjectId
  private state: TaskServiceData

  static readonly removeOnComplete = true
  static readonly removeOnFail = 8

  public static jobOpts = {
    removeOnComplete: TasksService.removeOnComplete,
    removeOnFail: TasksService.removeOnFail
  }

  public static VALIDATION_FLOW: FlowJob = {
    name: 'verify',
    queueName: 'tasks-queue',
    opts: TasksService.jobOpts,
    children: [
      {
        name: 'validate-relays',
        queueName: 'validation-queue',
        opts: TasksService.jobOpts,
        children: [
          {
            name: 'filter-relays',
            queueName: 'validation-queue',
            opts: TasksService.jobOpts,
            children: [
              {
                name: 'fetch-relays',
                queueName: 'validation-queue',
                opts: TasksService.jobOpts
              }
            ]
          }
        ]
      }
    ]
  }

  public static VERIFICATION_FLOW(validation: ValidationData): FlowJob {
    return {
      name: 'persist-verification',
      queueName: 'verification-queue',
      opts: TasksService.jobOpts,
      data: validation.validated_at,
      children: [
        {
          name: 'confirm-verification',
          queueName: 'verification-queue',
          data: validation.validated_at,
          opts: TasksService.jobOpts,
          children: [
            {
              name: 'verify-relays',
              queueName: 'verification-queue',
              opts: TasksService.jobOpts,
              data: validation.relays
            }
          ]
        }
      ]
    }
  }

  constructor(
    private readonly config: ConfigService<{
      IS_LIVE: string
      DO_CLEAN: boolean
    }>,
    @InjectQueue('tasks-queue') public tasksQueue: Queue,
    @InjectQueue('validation-queue') public validationQueue: Queue,
    @InjectFlowProducer('validation-flow')
    public validationFlow: FlowProducer,
    @InjectQueue('verification-queue') public verificationQueue: Queue,
    @InjectFlowProducer('verification-flow')
    public verificationFlow: FlowProducer,
    @InjectModel(TaskServiceData.name)
    private readonly taskServiceDataModel: Model<TaskServiceData>
  ) {
    this.isLive = this.config.get<string>('IS_LIVE', { infer: true })
    this.doClean = this.config.get<string>('DO_CLEAN', { infer: true })
    this.state = { isValidating: false }
  }

  private async createServiceState(): Promise<void> {
    const newData = await this.taskServiceDataModel.create(this.state)
    this.dataId = newData._id
  }

  private async updateServiceState(): Promise<void> {
    const updateResult = await this.taskServiceDataModel.updateOne(
      { _id: this.dataId },
      this.state
    )
    if (!updateResult.acknowledged) {
      this.logger.error(
        'Failed to acknowledge update of the task service state'
      )
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Bootstrapping Tasks Service')
    const hasData = await this.taskServiceDataModel.exists({})

    if (hasData) {
      const serviceData = await this.taskServiceDataModel
        .findOne({})
        .exec()
        .catch((error) => {
          this.logger.error(error)
        })

      if (serviceData) {
        this.dataId = serviceData._id
        this.state = { isValidating: serviceData.isValidating }
      } else {
        this.logger.warn(
          'This should not happen. Data was deleted, or is incorrect'
        )
        this.createServiceState()
      }
    } else this.createServiceState()

    this.logger.log(
      `Bootstrapped Tasks Service ` +
        `[id: ${this.dataId}, isValidating: ${this.state.isValidating}]`
    )

    if (this.doClean != 'true') {
      this.logger.log('Skipped cleaning up old jobs')
    } else {
      this.logger.log('Cleaning up old (24hrs+) jobs')
      await this.tasksQueue.clean(24 * 60 * 60 * 1000, -1)
      await this.validationQueue.clean(24 * 60 * 60 * 1000, -1)
      await this.verificationQueue.clean(24 * 60 * 60 * 1000, -1)
      this.state.isValidating = false
      await this.updateServiceState()
    }

    if (this.isLive != 'true') {
      this.logger.log('Cleaning up queues for dev...')
      await this.tasksQueue.obliterate({ force: true })
      await this.validationQueue.obliterate({ force: true })
      await this.verificationQueue.obliterate({ force: true })

      await this.queueValidateRelays(0)
      this.logger.log('Queued immediate validation of relays')
    } else {
      // if (this.state.isValidating) {
      //   this.logger.log('The validation of relays should already be queued')
      // } else {
        await this.queueValidateRelays(0)
        this.logger.log('Queued immediate validation of relays')
      // }
    }
  }

  public async queueValidateRelays(
    delayJob: number = 1000 * 60 * 60 * 1
  ): Promise<void> {
    if (!this.state.isValidating) {
      this.state.isValidating = true
      await this.updateServiceState()
    }

    await this.tasksQueue.add(
      'validate',
      {},
      {
        delay: delayJob,
        removeOnComplete: TasksService.removeOnComplete,
        removeOnFail: TasksService.removeOnFail
      }
    )

    this.logger.log(
      '[alarm=enqueued-validate-relays] Queued validation of relays'
    )
  }
}
