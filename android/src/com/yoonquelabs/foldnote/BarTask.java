package com.yoonquelabs.foldnote;

/** Bridge 가 받은 호출을 UI 스레드로 넘기는 심부름꾼. 익명 클래스를 피하려고 파일로 뺐다. */
public class BarTask implements Runnable {
    private final MainActivity host;
    private final boolean dark;

    public BarTask(MainActivity host, boolean dark) {
        this.host = host;
        this.dark = dark;
    }

    @Override
    public void run() {
        host.applyBarAppearance(dark);
    }
}
