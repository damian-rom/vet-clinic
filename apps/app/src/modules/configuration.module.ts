import { Module } from '@nestjs/common';
import { ConfigurationController } from '../controllers/configuration.controller';

@Module({ controllers: [ConfigurationController] })
export class ConfigurationModule {}
