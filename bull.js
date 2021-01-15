import { Worker, Job } from 'bullmq'

const worker = new Worker(queueName, async (job) => {
    // Do something with job
    return 'some value';
});