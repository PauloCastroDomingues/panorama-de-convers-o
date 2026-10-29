"""Separate Sheets OAuth from Cloud SDK ADC. Never broaden the SDK client scopes."""
import argparse
import json
from pathlib import Path

import refresh_crm_ssot as ssot

SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
TOKEN_PATH = ssot.ROOT / '.local/google-sheets-credentials.json'
SHEET_IDS = ('1zwtc4hHo-7GXHWBXut3Xd43ybGs2IHM_K_Xh603MwQw', '1OcM3LBfMUnToMbLKXtZfgB_3CAux4om7rQ1iLSSEHXc')


def validate_client(config):
    from google.auth import _cloud_sdk
    client = config.get('installed', {})
    if not client.get('client_id') or not client.get('client_secret'):
        raise ssot.RefreshError('sheets_desktop_oauth_client_required')
    if client['client_id'] == _cloud_sdk.CLOUD_SDK_CLIENT_ID:
        raise ssot.RefreshError('sheets_own_oauth_client_required')
    if client.get('auth_uri') != 'https://accounts.google.com/o/oauth2/auth' or client.get('token_uri') != 'https://oauth2.googleapis.com/token':
        raise ssot.RefreshError('sheets_oauth_endpoints_invalid')
    return config


def load_credentials(path=TOKEN_PATH):
    from google.oauth2.credentials import Credentials
    from google.auth import _cloud_sdk
    if not path.is_file():
        raise ssot.RefreshError('sheets_oauth_setup_required')
    info = json.loads(path.read_text(encoding='utf-8'))
    if info.get('client_id') == _cloud_sdk.CLOUD_SDK_CLIENT_ID:
        raise ssot.RefreshError('sheets_own_oauth_client_required')
    if set(info.get('scopes', [])) != {SCOPE} or info.get('token_uri') != 'https://oauth2.googleapis.com/token':
        raise ssot.RefreshError('sheets_readonly_scope_required')
    return Credentials.from_authorized_user_info(info, scopes=[SCOPE])


def authorize(client_file):
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import AuthorizedSession
    config = validate_client(json.loads(client_file.read_text(encoding='utf-8-sig')))
    flow = InstalledAppFlow.from_client_config(config, scopes=[SCOPE], autogenerate_code_verifier=True)
    print('Autorize somente a leitura das planilhas na janela Google.', flush=True)
    credentials = flow.run_local_server(host='localhost', port=8086, timeout_seconds=300,
        authorization_prompt_message='Aguardando a confirmacao no navegador.',
        success_message='Login recebido. Validando acesso de leitura das planilhas.', prompt='consent')
    if not credentials.refresh_token or not credentials.has_scopes([SCOPE]):
        raise ssot.RefreshError('sheets_authorization_incomplete')
    with AuthorizedSession(credentials) as session:
        for sheet_id in SHEET_IDS:
            response = session.get('https://sheets.googleapis.com/v4/spreadsheets/' + sheet_id,
                                   params={'fields': 'spreadsheetId'}, timeout=30)
            if not response.ok or response.json().get('spreadsheetId') != sheet_id:
                raise ssot.RefreshError('sheets_read_access_not_confirmed')
    TOKEN_PATH.parent.mkdir(exist_ok=True)
    payload = json.loads(credentials.to_json())
    if set(payload.get('scopes', [])) != {SCOPE}:
        raise ssot.RefreshError('sheets_readonly_scope_required')
    payload.pop('token', None)
    payload.pop('expiry', None)
    ssot.atomic_json(TOKEN_PATH, payload)
    print('Leitura das duas planilhas confirmada. Credencial privada separada do SSOT.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client-file', required=True, type=Path, help='JSON OAuth Desktop criado no projeto da empresa; nao e uma chave de conta de servico.')
    try:
        authorize(parser.parse_args().client_file)
        return 0
    except Exception as error:
        print('Autorizacao nao concluida: ' + ssot.safe_error(error), flush=True)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
