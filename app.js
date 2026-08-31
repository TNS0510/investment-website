// 1. Wait for the webpage structure to fully load into memory
document.addEventListener('DOMContentLoaded', () => {

    // 2. Select the inquiry form by its HTML ID attribute
    const inquiryForm = document.getElementById('inquiryForm');

    // 3. Make sure the form actually exists on the page before attaching the listener
    if (inquiryForm) {

        // Resolve API base: same-origin in production, localhost:5000 in local dev
        const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:5000'
            : window.location.origin;

        inquiryForm.addEventListener('submit', function(event) {

            // 4. Prevent the browser from performing a full page reload
            event.preventDefault();

            // 5. Collect all named form values into a plain object
            const formData = new FormData(inquiryForm);
            const payload = Object.fromEntries(formData.entries());

            // 6. POST the payload to the inquiry endpoint
            fetch(`${API_BASE}/api/submit/inquiry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert(`Thank you, ${payload.fullName}.\nYour secure advisory inquiry regarding "${payload.inquiryType}" has been registered. An Alliance Global Capital relationship officer will contact you shortly.`);
                    inquiryForm.reset();
                } else {
                    alert('Submission error: ' + (data.message || 'Please try again.'));
                }
            })
            .catch(error => {
                console.error('Network Error:', error);
                alert('Could not reach the server. Please ensure the backend is running and try again.');
            });
        });
    }
});
