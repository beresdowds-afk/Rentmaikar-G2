# Rentmaikar Call Metrics - Reference Data

## Provider Stack

| Metric Area | USA (+1) | Nigeria (+234) |
|---|---|---|
| **Voice Calls** | Twilio Voice API | Termii Voice API |
| **SMS** | Twilio SMS | Termii SMS |
| **WhatsApp** | Twilio WhatsApp | Termii WhatsApp |
| **Cost per Call** | ~$0.15 | ~$0.08 |
| **Cost per SMS** | ~$0.02 | ~$0.01 |

```javascript
// Real-time call monitoring
const callMetrics = {
  totalCalls: 1250,
  averageWaitTime: 45, // seconds
  abandonmentRate: 0.12,
  callOutcomes: {
    resolved: 850,
    transferred: 250,
    abandoned: 150
  },
  byRegion: {
    usa: {
      provider: 'twilio',
      calls: 750,
      avgDuration: 320, // seconds
      topIssues: ['Payment', 'Extension', 'Document']
    },
    nigeria: {
      provider: 'termii',
      calls: 500,
      avgDuration: 380,
      topIssues: ['Police Report', 'Payment', 'Registration']
    }
  },
  peakHours: {
    usa: ['9am-11am EST', '2pm-4pm EST'],
    nigeria: ['10am-12pm WAT', '3pm-5pm WAT']
  }
};

// Call analytics with regional provider breakdown
const callAnalytics = {
  realtime: {
    activeOutboundCalls: 23,
    queuedCalls: 45,
    successRate: 0.78,
    averageDuration: 185, // seconds
    byProvider: {
      twilio: { activeCalls: 14, queuedCalls: 25, region: 'USA (+1)' },
      termii: { activeCalls: 9, queuedCalls: 20, region: 'Nigeria (+234)' }
    },
    byType: {
      payment_default: { total: 150, success: 120, avgDuration: 210 },
      document_reminder: { total: 85, success: 72, avgDuration: 145 },
      vehicle_return: { total: 65, success: 58, avgDuration: 95 },
      owner_payout: { total: 40, success: 38, avgDuration: 75 }
    }
  },

  daily: {
    date: "2024-01-15",
    totalCalls: 450,
    answered: 350,
    voicemail: 75,
    failed: 25,
    byProvider: {
      twilio: { calls: 270, answered: 215, failed: 12 },
      termii: { calls: 180, answered: 135, failed: 13 }
    },
    conversionRate: {
      payment_collection: 0.65,
      document_upload: 0.82,
      extension_booking: 0.45
    }
  },

  monthly: {
    callsByType: [
      { type: "Payment Default", count: 1250, trend: "+12%" },
      { type: "Document Reminder", count: 850, trend: "-5%" },
      { type: "Vehicle Return", count: 620, trend: "+8%" },
      { type: "Owner Payout", count: 430, trend: "+15%" }
    ],
    bestTimeToCall: {
      usa: "2:00 PM - 4:00 PM EST",       // Twilio
      nigeria: "10:00 AM - 12:00 PM WAT"   // Termii
    },
    channelPerformance: {
      call:     { success: 0.78, costUSD: 0.15, costNGN: 0.08 },
      sms:      { success: 0.92, costUSD: 0.02, costNGN: 0.01 },
      whatsapp: { success: 0.88, costUSD: 0.05, costNGN: 0.03 },
      email:    { success: 0.65, costUSD: 0.001, costNGN: 0.001 }
    }
  }
};
```
