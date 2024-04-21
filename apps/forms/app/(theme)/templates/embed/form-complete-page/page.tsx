import Link from "next/link";

export default function Component() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 py-12">
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg w-full max-w-md px-8 py-12">
        <div className="flex flex-col items-center">
          <div className="text-6xl font-bold text-green-500 mb-4">#123</div>
          <h2 className="text-2xl font-bold mb-4">Order Confirmed</h2>
          <div className="border-t border-gray-200 dark:border-gray-700 w-full my-6 py-6">
            <div className="flex justify-between items-center mb-2">
              <p className="text-gray-500 dark:text-gray-400">
                Acme Circles T-Shirt
              </p>
              <p className="text-gray-700 dark:text-gray-300">x2</p>
              <p className="text-gray-700 dark:text-gray-300">$99.00</p>
            </div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-gray-500 dark:text-gray-400">Aqua Filters</p>
              <p className="text-gray-700 dark:text-gray-300">x1</p>
              <p className="text-gray-700 dark:text-gray-300">$49.00</p>
            </div>
            <div className="flex justify-between items-center">
              <p className="text-gray-500 dark:text-gray-400">Subtotal</p>
              <p className="text-gray-700 dark:text-gray-300">$247.00</p>
            </div>
          </div>
          <Link
            className="inline-flex items-center justify-center px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-200 dark:focus:ring-gray-300"
            href="#"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
