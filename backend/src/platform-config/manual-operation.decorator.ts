import { SetMetadata } from '@nestjs/common';

export const MANUAL_OPERATION_KEY = 'manualOperation';
export const ManualOperation = () => SetMetadata(MANUAL_OPERATION_KEY, true);
