# Rentmaikar Call Router & Emergency Handler - Reference Implementation

This is a reference implementation for the call routing and emergency handling APIs.
These patterns should be adapted into Supabase Edge Functions for production use.

```javascript
// API endpoint for call routing
app.post('/api/call-router', async (req, res) => {
  const { CallSid, From, Digits } = req.body;
  
  try {
    // Check caller in database
    const user = await db.query(
      'SELECT * FROM users WHERE phone = $1',
      [From]
    );
    
    // Get user's current context
    let context = {};
    if (user.rows[0]) {
      const userId = user.rows[0].id;
      
      // Check for active issues
      const [defaults, expiringDocs, activeRental] = await Promise.all([
        db.query('SELECT * FROM payment_defaults WHERE driver_id = $1 AND resolved = false', [userId]),
        db.query('SELECT * FROM vehicle_documents WHERE expiry_date < NOW() + INTERVAL \'30 days\'', [userId]),
        db.query('SELECT * FROM rentals WHERE driver_id = $1 AND status = \'active\'', [userId])
      ]);
      
      context = {
        hasDefaults: defaults.rows.length > 0,
        hasExpiringDocs: expiringDocs.rows.length > 0,
        hasActiveRental: activeRental.rows.length > 0,
        userType: user.rows[0].user_type,
        country: user.rows[0].country
      };
    }
    
    // Generate dynamic IVR menu based on context
    const menu = generateDynamicMenu(context);
    
    // Log call
    await db.query(
      'INSERT INTO call_logs (call_sid, from_number, timestamp, context) VALUES ($1, $2, NOW(), $3)',
      [CallSid, From, context]
    );
    
    res.json({
      action: 'redirect',
      url: menu
    });
    
  } catch (error) {
    console.error('Call routing error:', error);
    res.json({
      action: 'redirect',
      url: '/ivm/fallback.xml'
    });
  }
});

// Emergency response handler
app.post('/api/emergency', async (req, res) => {
  const { CallSid, From, Digits } = req.body;
  
  // Get caller location (if available)
  const location = await getCallerLocation(CallSid);
  
  // Log emergency
  await db.query(
    'INSERT INTO emergencies (call_sid, from_number, type, location, timestamp) VALUES ($1, $2, $3, $4, NOW())',
    [CallSid, From, Digits, location]
  );
  
  // Trigger alerts based on emergency type
  switch(Digits) {
    case '1': // Accident
      await notifyTeam('accident', { CallSid, From, location });
      break;
    case '2': // Breakdown
      await dispatchRoadside(From, location);
      break;
    case '3': // Security
      await notifySecurity(From, location);
      break;
    case '4': // Medical
      await dispatchAmbulance(From, location);
      break;
  }
  
  // Send SMS with instructions
  await sendEmergencySMS(From, Digits);
  
  res.json({
    action: 'say',
    text: 'Emergency services have been notified. Help is on the way.'
  });
});
```
