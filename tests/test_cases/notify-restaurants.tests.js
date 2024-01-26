const { init } = require('../steps/init')
const when = require('../steps/when')
const chance = require('chance').Chance()
const { EventBridgeClient } = require('@aws-sdk/client-eventbridge')
const { SNSClient } = require('@aws-sdk/client-sns')
const messages = require('../messages')

const mockEvbSend = jest.fn()
const mockSnsSend = jest.fn()

describe(`When we invoke the notify-restaurant function`, () => {
  const event = {
    source: 'big-mouth',
    'detail-type': 'order_placed',
    detail: {
      orderId: chance.guid(),
      restaurantName: 'Fangtasia'
    }
  }

  let listener

  beforeAll(async () => {
    await init()

    if (process.env.TEST_MODE === 'handler') {
      EventBridgeClient.prototype.send = mockEvbSend
      SNSClient.prototype.send = mockSnsSend

      mockEvbSend.mockReturnValue({})
      mockSnsSend.mockReturnValue({})
    } else {
      listener = messages.startListening()      
    }

    await when.we_invoke_notify_restaurant(event)
  })

  afterAll(async () => {
    if (process.env.TEST_MODE === 'handler') {
      mockEvbSend.mockClear()
      mockSnsSend.mockClear()
    } else {
      await listener.stop()
    }
  })

  if (process.env.TEST_MODE === 'handler') {
    it(`Should publish message to SNS`, async () => {
      expect(mockSnsSend).toHaveBeenCalledTimes(1)
      const [ publishCmd ] = mockSnsSend.mock.calls[0]

      expect(publishCmd.input).toEqual({
        Message: expect.stringMatching(`"restaurantName":"Fangtasia"`),
        TopicArn: expect.stringMatching(process.env.restaurant_notification_topic)
      })
    })

    it(`Should publish event to EventBridge`, async () => {
      expect(mockEvbSend).toHaveBeenCalledTimes(1)
      const [ putEventsCmd ] = mockEvbSend.mock.calls[0]
      expect(putEventsCmd.input).toEqual({
        Entries: [
          expect.objectContaining({
            Source: 'big-mouth',
            DetailType: 'restaurant_notified',
            Detail: expect.stringContaining(`"restaurantName":"Fangtasia"`),
            EventBusName: process.env.bus_name
          })
        ]
      })
    })
  } else {
    it(`Should publish message to SNS`, async () => {
      const expectedMsg = JSON.stringify(event.detail)
      await listener.waitForMessage(x => 
        x.sourceType === 'sns' &&
        x.source === process.env.restaurant_notification_topic &&
        x.message === expectedMsg
      )
    }, 10000)
  }
})