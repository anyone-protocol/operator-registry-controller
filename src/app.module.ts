import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { ScheduleModule } from '@nestjs/schedule'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { VerificationModule } from './verification/verification.module'
import { TasksModule } from './tasks/tasks.module'
import { ValidationModule } from './validation/validation.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService<{ MONGO_URI: string }>],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI', { infer: true })
      })
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<{
          REDIS_HOSTNAME: string
          REDIS_PORT: number
        }>
      ) => ({
        connection: {
          host: config.get<string>('REDIS_HOSTNAME', { infer: true }),
          port: config.get<number>('REDIS_PORT', { infer: true })
        }
      })
    }),
    ScheduleModule.forRoot(),
    TasksModule,
    ValidationModule,
    VerificationModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
