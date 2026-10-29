import json
from pathlib import Path
import tempfile
import unittest
from google.auth import _cloud_sdk

import google_sheets_auth as auth
import refresh_crm_ssot as ssot


class SheetsAuthTests(unittest.TestCase):
    def info(self):
        return {'client_id': 'unit-test-client', 'client_secret': 'unit-test-secret',
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token', 'refresh_token': 'unit-test-token', 'scopes': [auth.SCOPE]}

    def test_sdk_client_is_rejected_before_opening_browser(self):
        info = self.info()
        info['client_id'] = _cloud_sdk.CLOUD_SDK_CLIENT_ID
        with self.assertRaisesRegex(ssot.RefreshError, 'own_oauth_client_required'):
            auth.validate_client({'installed': info})

    def test_requires_real_desktop_config_and_google_endpoints(self):
        with self.assertRaisesRegex(ssot.RefreshError, 'desktop_oauth_client_required'):
            auth.validate_client({'web': self.info()})
        info = self.info()
        info['token_uri'] = 'https://example.invalid/token'
        with self.assertRaisesRegex(ssot.RefreshError, 'endpoints_invalid'):
            auth.validate_client({'installed': info})

    def test_missing_config_does_not_fall_back_to_cloud_sdk(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ssot.RefreshError, 'setup_required'):
                auth.load_credentials(Path(directory) / 'missing.json')

    def test_only_readonly_scope_is_loaded(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'credentials.json'
            path.write_text(json.dumps(self.info()))
            credentials = auth.load_credentials(path)
            self.assertTrue(credentials.has_scopes([auth.SCOPE]))
            info = self.info()
            info['scopes'].append('https://www.googleapis.com/auth/spreadsheets')
            path.write_text(json.dumps(info))
            with self.assertRaisesRegex(ssot.RefreshError, 'readonly_scope_required'):
                auth.load_credentials(path)


if __name__ == '__main__':
    unittest.main()
