//! A simple example of hooking up stdin/stdout to a WebSocket stream.
//!
//! This example will connect to a server specified in the argument list and
//! then forward all data read on stdin to the server, printing out all data
//! received on stdout.
//!
//! Note that this is not currently optimized for performance, especially around
//! buffer management. Rather it's intended to show an example of working with a
//! client.
//!
//! You can use this example together with the `server` example.

use core::panic;
use std::{
    env,
    time::{Duration, Instant},
};

use futures_util::{SinkExt, StreamExt};
use tokio::{sync::mpsc, time::sleep};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

fn usage() -> ! {
    eprintln!("Usage: stdin-stdout <connect_addr> <clients>");
    panic!();
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();
    let connect_addr = args.get(1).unwrap_or_else(|| usage());
    let client_count = args
        .get(2)
        .unwrap_or_else(|| usage())
        .parse::<usize>()
        .unwrap();
    let url = url::Url::parse(&format!("ws://{connect_addr}/v1/doc?docId=doc")).unwrap();

    let start = Instant::now();
    let (introduced_tx, mut introduced_rx) = mpsc::unbounded_channel::<usize>();
    for i in 0..client_count {
        let url = url.clone();
        let introduced_tx = introduced_tx.clone();
        tokio::spawn(async move {
            let res = run_client(url, i, introduced_tx).await;
            if let Err(e) = res {
                eprintln!("Error: {}", e);
            } else {
                eprintln!("Client {} finished", i);
            }
        });
    }

    let mut remaining = client_count;
    while let Some(_id) = introduced_rx.recv().await {
        remaining -= 1;
        if remaining == 0 {
            break;
        }
    }

    eprintln!("All clients introduced in {:?}", start.elapsed());
}

async fn run_client(
    url: url::Url,
    id: usize,
    introduced_tx: mpsc::UnboundedSender<usize>,
) -> Result<(), eyre::Error> {
    sleep(Duration::from_millis(rand::random::<u64>() % 10)).await;

    let (ws_stream, _) = connect_async(url).await?;
    let (mut tx, mut rx) = ws_stream.split();

    tx.send(Message::Text(
        r#"{"type": "auth", "token": "token"}"#.into(),
    ))
    .await?;

    let _intro1 = rx.next().await.ok_or_else(|| eyre::eyre!("No intro1"))??;
    let _intro2 = rx.next().await.ok_or_else(|| eyre::eyre!("No intro2"))??;
    introduced_tx.send(id)?;

    rx.for_each(|_msg| async {}).await;

    Ok(())
}
