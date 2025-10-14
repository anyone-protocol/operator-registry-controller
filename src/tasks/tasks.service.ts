import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectQueue, InjectFlowProducer } from '@nestjs/bullmq'
import { Queue, FlowProducer, FlowJob } from 'bullmq'
import { ConfigService } from '@nestjs/config'

import { ClusterService } from '../cluster/cluster.service'
import { ValidationDataDto } from 'src/validation/dto/validation-data-dto'

@Injectable()
export class TasksService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TasksService.name)

  private isLive?: string
  private doClean?: string

  static readonly removeOnComplete = true
  static readonly removeOnFail = 8
  static readonly DEFAULT_DELAY = 1000 * 60 * 60 * 1 // 1 hour

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

  public static VERIFICATION_FLOW(validation: ValidationDataDto): FlowJob {
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
    private readonly clusterService: ClusterService
  ) {
    this.isLive = this.config.get<string>('IS_LIVE', { infer: true })
    this.doClean = this.config.get<string>('DO_CLEAN', { infer: true })
  }

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Bootstrapping Tasks Service')

    if (this.clusterService.isTheOne()) {
      this.logger.log(
        `I am the leader, checking queue cleanup & immediate queue start`
      )

      if (this.isLive != 'true') {
        this.logger.log('Cleaning up tasks queue because IS_LIVE is not true')
        await this.tasksQueue.obliterate({ force: true })
        await this.validationQueue.obliterate({ force: true })
        await this.verificationQueue.obliterate({ force: true })
      }

      if (this.doClean === 'true') {
        this.logger.log('Cleaning up tasks queue because DO_CLEAN is true')
        await this.tasksQueue.obliterate({ force: true })
        await this.validationQueue.obliterate({ force: true })
        await this.verificationQueue.obliterate({ force: true })
      }

      this.logger.log('Queueing immediate validation of relays')
      this.queueValidateRelays({ delayJob: 0 }).catch(error => {
        this.logger.error(
          `Error queueing immediate validation of relays: ${error.message}`,
          error.stack
        )
      })
    } else {
      this.logger.log(
        `Not the leader, skipping queue cleanup check & ` +
          `skipping queueing immediate tasks`
      )
    }
  }

  public async queueValidateRelays(
    opts: {
      delayJob?: number
      skipActiveCheck?: boolean
    } = {
      delayJob: TasksService.DEFAULT_DELAY,
      skipActiveCheck: false
    }
  ): Promise<void> {
    this.logger.log(
      `Checking jobs in tasks queue before queueing new validate relays job ` +
        `with delay: ${opts.delayJob}ms`
    )
    let numJobsInQueue = 0
    numJobsInQueue += await this.tasksQueue.getWaitingCount()
    numJobsInQueue += await this.tasksQueue.getDelayedCount()
    if (!opts.skipActiveCheck) {
      numJobsInQueue += await this.tasksQueue.getActiveCount()
    }
    if (numJobsInQueue > 0) {
      this.logger.warn(
        `There are ${numJobsInQueue} jobs in the tasks queue, ` +
          `not queueing new validate relays job`
      )
      return
    }

    this.logger.log(
      `Queueing validate relays job with delay: ${opts.delayJob}ms`
    )
    await this.tasksQueue.add(
      'validate',
      {},
      {
        delay: opts.delayJob,
        removeOnComplete: TasksService.removeOnComplete,
        removeOnFail: TasksService.removeOnFail
      }
    )

    this.logger.log(
      '[alarm=enqueued-validate-relays] Queued validation of relays'
    )
  }
}
