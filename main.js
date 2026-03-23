import { Actor } from 'apify';

await Actor.init();

try {
  // Step 1 - Get input from the form
  const input = await Actor.getInput();
  
  console.log('Raw input:', JSON.stringify(input));

  const firstName = input.firstName || '';
  const lastName = input.lastName || '';
  const domain = input.domain || '';
  const csvUrl = input.uploadedFile || input.fileUrl || input.csvUrl || '';

  console.log('First Name:', firstName);
  console.log('Last Name:', lastName);
  console.log('Domain:', domain);
  console.log('CSV URL:', csvUrl);

  if (!csvUrl) {
    throw new Error('No CSV URL provided in input!');
  }

  // Step 2 - Send to Google Apps Script
  console.log('Sending to Google Apps Script...');

  const response = await fetch(
    'https://script.google.com/macros/s/AKfycbyrkTBophapts2XV4ZA2HxmzUgB26wfhcZmm7qAz7wuRckW5suJSENN6GL_G4zeFx7I/exec',
    {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        firstName: firstName,
        lastName: lastName,
        domain: domain,
        csvUrl: csvUrl
      })
    }
  );

  console.log('Response status:', response.status);
  const text = await response.text();
  console.log('Response text:', text);

  const result = JSON.parse(text);

  if (result.status === 'success') {
    console.log('CSV saved to Google Drive successfully!');
    console.log('File name:', result.fileName);
    console.log('File link:', result.fileLink);
  } else {
    console.log('Error from script:', result.message);
  }

} catch (error) {
  console.log('Actor error:', error.message);
}

await Actor.exit();
