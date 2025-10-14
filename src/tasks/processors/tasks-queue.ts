import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { Job } from 'bullmq'

import { TasksService } from '../tasks.service'
import { ValidationDataDto } from 'src/validation/dto/validation-data-dto'

@Processor('tasks-queue')
export class TasksQueue extends WorkerHost {
  private readonly logger = new Logger(TasksQueue.name)

  public static readonly JOB_VALIDATE = 'validate'
  public static readonly JOB_VERIFY = 'verify'

  constructor(private readonly tasks: TasksService) {
    super()
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Dequeueing ${job.name} [${job.id}]`)

    switch (job.name) {
      case TasksQueue.JOB_VALIDATE:
        try {
          this.tasks.validationFlow.add(TasksService.VALIDATION_FLOW)
        } catch (error) {
          this.logger.error(
            'Exception while adding validate relays job',
            error.stack
          )
        }

        await this.tasks.queueValidateRelays({
          delayJob: TasksService.DEFAULT_DELAY,
          skipActiveCheck: true
        })
        break

      case TasksQueue.JOB_VERIFY:
        this.logger.log(`Initializing verifyication flow...`)
        const validationData: ValidationDataDto[] = Object.values(
          await job.getChildrenValues()
        ).reduce((prev, curr) => (prev as []).concat(curr as []), [])

        if (validationData.length > 0) {
          this.tasks.verificationFlow.add(
            TasksService.VERIFICATION_FLOW(validationData[0])
          )
        } else {
          this.logger.warn('Nothing to publish, this should not happen')
        }

        break

      default:
        this.logger.warn(`Found unknown job ${job.name} [${job.id}]`)
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<any, any, string>) {
    this.logger.log(`Finished ${job.name} [${job.id}]`)
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<any, any, string>) {
    this.logger.error(`[alarm=failed-job-${job.name}] Failed ${job.name} [${job.id}]: ${job.failedReason}`)
  }
}
