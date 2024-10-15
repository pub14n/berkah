<?php
// Path to your JSON files
$qr_code_path = 'qr_code.json'; // Adjust path as needed
$session_status_path = 'session_status.json'; // Adjust path as needed

// Function to get JSON data from a file
function get_json_data($file_path) {
    if (file_exists($file_path)) {
        $json_data = file_get_contents($file_path);
        return json_decode($json_data, true);
    } else {
        return null;
    }
}

// Get QR code and session status
$qr_data = get_json_data($qr_code_path);
$status_data = get_json_data($session_status_path);

// Output the QR code and status
if ($status_data && $status_data['connected']) {
    echo "<h3>Status: Terhubung</h3>";
    
    // Display "Diskonek" button if connected
    echo "<form action='http://localhost:3000/disconnect' method='post'>
            <button type='submit' class='disconnect-btn'>Diskonek</button>
          </form>";
} else {
    echo "<h3>Status: Tidak Terhubung</h3>";
    
    // Show QR code if available
    if ($qr_data && isset($qr_data['qr'])) {
        echo "<img src='" . $qr_data['qr'] . "' alt='QR Code'>";
    } else {
        echo "<p>QR code tidak tersedia.</p>";
    }
}
?>
