import { Actor } from 'apify';

await Actor.init();

// Step 1 - Get input from the form
const input = await Actor.getInput();
const { firstName, lastName, domain, uploadedFile } = input;

console.log('Input received:');
console.log('First Name:', firstName);
console.log('Last Name:', lastName);
console.log('Domain:', domain);
console.log('CSV URL:', uploadedFile);

// Step 2 - Send to Google Apps Script
console.log('Downloading CSV and saving to Google Drive...');

const response = await fetch('https://script.google.com/macros/s/AKfycbyrkTBophapts2XV4ZA2HxmzUgB26wfhcZmm7qAz7wuRckW5suJSENN6GL_G4zeFx7I/exec', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    firstName: firstName,
    lastName: lastName,
    domain: domain,
    csvUrl: uploadedFile
  })
});

// Step 3 - Check result
const result = await response.json();

if (result.status === 'success') {
  console.log('CSV saved to Google Drive!');
  console.log('File name:', result.fileName);
  console.log('File link:', result.fileLink);
} else {
  console.log('Something went wrong:', result.message);
}

await Actor.exit();
