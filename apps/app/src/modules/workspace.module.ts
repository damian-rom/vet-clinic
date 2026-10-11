import { Module } from '@nestjs/common';
import { WorkspaceController } from '../controllers/workspace.controller';

@Module({ controllers: [WorkspaceController] })
export class WorkspaceModule {}
