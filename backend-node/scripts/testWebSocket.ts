import WebSocket from 'ws';

async function testWebSocket() {
  const token = '8c386029-df4b-403a-b02d-81d57ec1a889';
  const url = `ws://localhost:5000/ws/support/${token}/?user_type=client`;

  console.log(`Connecting to ${url}...`);
  const ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('Connected successfully to WebSocket support room!');

    // Send field sync
    const msg = {
      type: 'FIELD_SYNC',
      payload: {
        page_id: 'discovery',
        field_key: 'what_business_does',
        value: 'Real-time sync test from Node.js WS!',
        user_type: 'client'
      }
    };
    ws.send(JSON.stringify(msg));
    console.log('Sent FIELD_SYNC message.');
  });

  ws.on('message', (data) => {
    console.log('Received from server:', data.toString());
    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    process.exit(1);
  });

  setTimeout(() => {
    console.log('Timeout waiting for WS response.');
    ws.close();
    process.exit(0);
  }, 5000);
}

testWebSocket();
