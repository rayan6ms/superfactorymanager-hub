export default function Head() {
  const client = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT;

  return (
    <>
      {client ? (
        <script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
          crossOrigin="anonymous"
        />
      ) : null}
    </>
  );
}