import { Injectable } from '@nestjs/common';
import * as AWS from 'aws-sdk';
import { DocumentClient } from 'aws-sdk/lib/dynamodb/document_client';
import { nanoid } from 'nanoid';

const dynamoDb = new AWS.DynamoDB.DocumentClient();

@Injectable()
export class AppService {
  getHello(): string {
    return 'Welcome to bridged hosting service. Learn more at https://github.com/bridgedxyz/services/';
  }
}
