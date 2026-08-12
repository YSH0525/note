package com.yoonquelabs.foldnote;

import android.content.Intent;
import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

public class ChromeClient extends WebChromeClient {
    private final MainActivity host;

    public ChromeClient(MainActivity host) {
        this.host = host;
    }

    @Override
    public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                     FileChooserParams params) {
        if (host.pendingFileCallback != null) host.pendingFileCallback.onReceiveValue(null);
        host.pendingFileCallback = callback;
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("image/*");
        pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        host.startActivityForResult(Intent.createChooser(pick, "사진 선택"), MainActivity.FILE_REQ);
        return true;
    }
}
